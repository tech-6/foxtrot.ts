import axios from 'axios'
import {
  ClusterClient,
  CommandClient,
  CommandClientOptions,
  CommandClientPrefixes,
  InteractionCommandClient,
  InteractionCommandClientOptions,
  ShardClient
} from 'detritus-client'
import { ActivityTypes, ClientEvents } from 'detritus-client/lib/constants'
import fs from 'fs';
import { decodeArrayStream } from '@msgpack/msgpack'
import * as Sentry from '@sentry/node'
import { PackageJson } from 'type-fest'
import Sh from 'sh';
import { Sequelize } from 'sequelize';

import { Voice } from './voice'
import { FILENAME_REGEX } from './constants';
import { Context } from 'detritus-client/lib/command';

export class CommandClientExtended extends CommandClient {
  public readonly application: Application

  constructor (
    application: Application,
    token: string | ClusterClient | ShardClient,
    options?: CommandClientOptions
  ) {
    super(token, options)
    this.application = application
  }

  public async onPrefixCheck(ctx: Context): Promise<CommandClientPrefixes> {
    const settings: any = await this.application.sequelize.models.settings.findOne({ where: { serverId: ctx.guildId } })
    if (settings && settings.prefix)
      return [ settings.prefix ]
    return this.prefixes.custom
  }
}

export class InteractionCommandClientExtended extends InteractionCommandClient {
  public readonly application: Application

  constructor (
    application: Application,
    token: string | ClusterClient | ShardClient,
    options?: InteractionCommandClientOptions
  ) {
    super(token, options)
    this.application = application
  }
}

export class Application {
  public config: IConfig
  public pkg: PackageJson
  public sh: Sh;
  public soundeffects: Record < string, string[] > = {}
  public startAt: number
  public voices: Map<string, Voice> = new Map()
  public readonly commandClient: CommandClientExtended
  public readonly clusterClient: ClusterClient
  public readonly interactionCommandClient: InteractionCommandClientExtended
  public readonly sequelize: Sequelize

  constructor (config: IConfig, pkg: PackageJson) {
    this.config = config
    this.pkg = pkg

    this.clusterClient = new ClusterClient(this.config.token, {
      gateway: {
        presence: {
          activity: {
            type: ActivityTypes.PLAYING,
            name: 'sounds / WIP, report issues with ~issue'
          }
        }
      }
    })

    this.clusterClient.on(
      ClientEvents.WARN,
      ({ error }) =>
        Sentry.captureException(error, {
          tags: { loc: 'root' }
        })
    )

    {
      this.commandClient = new CommandClientExtended(this, this.clusterClient, {
        prefix: this.config.prefix || '~',
        activateOnEdits: true,
      })
      this.commandClient.addMultipleIn('dist/commands/', {
        subdirectories: true
      })
    }

    {
      this.interactionCommandClient = new InteractionCommandClientExtended(this, this.clusterClient)
      this.interactionCommandClient.addMultipleIn('dist/interactionCommands/')
    }

    this.sequelize = new Sequelize(this.config.databaseURL);
    for (const storeFileName of fs.readdirSync('dist/models/')) {
      const fileName = storeFileName.replace(FILENAME_REGEX, '')
      const { name, attributes } = require('./models/' + fileName)
      this.sequelize.define(name, attributes);
    }

    this.startAt = Date.now()

    Sentry.init({
      dsn: this.config.sentryDSN
    })

    this.initialize();
  }

  private async initialize() {
    await this.fetchSoundeffects()
    this.sh = new Sh(this.soundeffects)
    await this.sequelize.sync()
    await this.clusterClient.run()
    await this.commandClient.run()
    await this.interactionCommandClient.run()

    console.log('Bot online!')
    console.log(`Loaded shards #(${this.clusterClient.shards.map((shard) => shard.shardId).join(', ')})`);
  }

  // Source: https://github.com/Metastruct/Chatsounds-X/blob/master/app/src/ChatsoundsFetcher.ts
  private async sfxBuildFromGitHub(repo: string, usesMsgPack: boolean, base?: string) {
    if (!base) base = 'sounds/chatsounds'

    const baseUrl = `https://raw.githubusercontent.com/${repo}/master/${base}/`;
    const sounds: Array<Array<string>> = [];

    if (usesMsgPack) {
      const resp = await axios.get(baseUrl + 'list.msgpack', { responseType: 'stream' });
      const generator: any = decodeArrayStream(resp.data);
      for await (const sound of generator)
        sounds.push(sound);
    } else {
      const responseFromGh = await axios.get(`https://api.github.com/repos/${repo}/git/trees/master?recursive=1`);
      const body: string = JSON.stringify(responseFromGh.data);
      let i: number = 0;
      for (const match of body.matchAll(/"path":\s*"([\w\/\s\.]+)"(?:\n|,|})/g)) {
        let path: string = match[1];
        if (!path || path.length === 0) continue;
        if (!path.startsWith(base) || !path.endsWith('.ogg')) continue;

        path = path.substring(base.length + 1);
        const chunks: Array<string> = path.split('/');
        const realm: string = chunks[0];
        let trigger: string = chunks[1];

        if (!chunks[2]) {
          trigger = trigger.substring(0, trigger.length - '.ogg'.length);
        }

        sounds[i] = [realm, trigger, path];

        if (trigger.startsWith('-')) {
          sounds[i][1] = sounds[i][1].substring(1);
          sounds[i][3] = `${realm}/${trigger}.txt`;
        }

        i++;
      }
    }

    for (const [ _realm, name, file ] of sounds) {
      if (!this.soundeffects[name])
        this.soundeffects[name] = [];
      this.soundeffects[name].push(baseUrl + file);
    }
  }

  private async fetchSoundeffects() {
    const exists = fs.existsSync('.shat');
    const stat = exists && fs.statSync('.shat');
    if (exists && (Date.now() - stat.mtimeMs) <= 24 * 60 * 60 * 1000) {
      this.soundeffects = JSON.parse(fs.readFileSync('.shat').toString());
    } else {
      console.log('No shat file or modification lifetime expired! Fetching...');

      const lists = {
        'PAC3-Server/chatsounds-valve-games': {
          bases: [ 'csgo', 'css', 'ep1', 'ep2', 'hl1', 'hl2', 'l4d', 'l4d2', 'portal', 'tf2' ],
          useMsgPack: true
        },
        'Metastruct/garrysmod-chatsounds': {
          bases: [ 'sound/chatsounds/autoadd' ],
          useMsgPack: false
        },
        'PAC3-Server/chatsounds': {
          bases: false,
          useMsgPack: false
        }
      };

      let i = 0;
      console.log(`Loading soundeffects... [0/${Object.entries(lists).length}]`);
      try {
        for (const repo in lists) {
          i++;
          const cfg = lists[repo];
          if (cfg.bases)
            for (const base of cfg.bases)
              await this.sfxBuildFromGitHub(repo, cfg.usesMsgPack, base)
          else
            await this.sfxBuildFromGitHub(repo, cfg.usesMsgPack);
          console.log(`Loading soundeffects... [${i}/${Object.entries(lists).length}]`);
        }

        console.log('Done! Writing...');
        fs.writeFileSync('.shat', JSON.stringify(this.soundeffects));
      } catch (err) {
        console.error(`Something went wrong while loading soundeffects! Halting loading... [${i}/${Object.entries(lists).length}]`);
        console.error(err);

        if (exists) {
          console.log('The file does exist, using it instead...');
          this.soundeffects = JSON.parse(fs.readFileSync('.shat').toString());
        }
      }
    }
  }
}
