import { GatewayClientEvents, Structures, Utils } from 'detritus-client';
import { VoiceConnection } from 'detritus-client/lib/media/voiceconnection';
import { OpusEncoder } from '@discordjs/opus';
import { EventEmitter } from 'events';
import { Transform, TransformCallback } from 'stream';

import { Mixer } from '@/modules/mixer';
import { Constants, Logger, UserError } from '@/modules/utils';

import NewVoice from '.';

const LEAVE_TIMEOUT_LENGTH = 30000; // 30 seconds

class VoiceSafeConnection extends EventEmitter {
  public voiceConnection!: VoiceConnection;
  private timeout: NodeJS.Timeout | null = null;
  private readonly logger: Logger;

  constructor(voiceChannel: Structures.ChannelGuildVoice) {
    super();
    this.logger = new Logger(`Voice safe connection [${voiceChannel.guildId}]`);
    this.onVoiceStateUpdate = this.onVoiceStateUpdate.bind(this);
    this.onVoiceServerUpdate = this.onVoiceServerUpdate.bind(this);
    this.destroy = this.destroy.bind(this);
    this.on('voiceStateUpdate', this.onVoiceStateUpdate);
    this.on('voiceServerUpdate', this.onVoiceServerUpdate);
    this.initialize(voiceChannel);
  }

  private async initialize(voiceChannel: Structures.ChannelGuildVoice) {
    if (!voiceChannel.canJoin || !voiceChannel.canSpeak)
      throw new Error(
        'Bot is not able to join or speak in this voice channel.'
      );
    const voiceConnectObj = await voiceChannel.join({ receive: true });
    if (!voiceConnectObj) {
      this.logger.debug('failed to connect, destroying');
      return this.destroy();
    }
    this.voiceConnection = voiceConnectObj.connection;
    this.voiceConnection.setOpusEncoder();
    this.voiceConnection.setSpeaking({
      voice: true,
    });
    this.voiceConnection.sendAudioSilenceFrame();
    this.voiceConnection.on('packet', (packet) => this.emit('packet', packet));

    /*
      what we are essentially doing here is not using detritus'
      reconnectivity, which is broken for some reason.

      instead we reconnect it ourselves (see onVoiceServerUpdate).
    */
    if (this.voiceConnection.gateway.socket)
      this.voiceConnection.gateway.socket.socket.onclose = () => {};

    this.emit('connected');
  }

  private get channel() {
    return this.voiceConnection ? this.voiceConnection.channel : undefined;
  }

  public async onVoiceServerUpdate(
    payload: GatewayClientEvents.VoiceServerUpdate
  ) {
    if (!this.channel) return;
    if (payload.guildId !== this.channel.guildId) return;
    this.voiceConnection.gateway.setEndpoint(payload.endpoint);
    this.voiceConnection.gateway.setToken(payload.token);
    if (this.voiceConnection.gateway.socket)
      this.voiceConnection.gateway.socket.socket.onclose = () => {};
    this.voiceConnection.gateway.once('transportReady', () => {
      this.logger.debug('gateway says ready');
      this.voiceConnection.setSpeaking({
        voice: true,
      });
      this.voiceConnection.gateway.transport?.connect();
    });
  }

  public async onVoiceStateUpdate(
    payload: GatewayClientEvents.VoiceStateUpdate
  ) {
    if (!this.channel) return;

    if (payload.voiceState.guildId === this.channel.guildId) {
      if (payload.leftChannel) {
        if (payload.voiceState.userId === this.channel.client.userId) {
          this.logger.debug('force disconnect');
          return this.destroy();
        }

        if (
          this.channel.members.size === 1 &&
          payload.differences?.channelId === this.channel.id &&
          !this.timeout
        ) {
          this.logger.debug("we're the only one left, starting timeout...");
          this.timeout = setTimeout(this.destroy, LEAVE_TIMEOUT_LENGTH);
          return;
        }
      }

      if (
        payload.joinedChannel &&
        payload.voiceState.channelId === this.channel.id &&
        this.timeout
      ) {
        this.logger.debug('stopping timeout, somebody joined!');
        clearTimeout(this.timeout);
        this.timeout = null;
      }
    }
  }

  public sendAudio(packet: Buffer) {
    if (!this.voiceConnection || this.voiceConnection.killed) return;
    this.voiceConnection.sendAudio(packet, { isOpus: true });
  }

  public sendEmpty() {
    if (!this.voiceConnection || this.voiceConnection.killed) return;
    this.voiceConnection.sendAudioSilenceFrame();
  }

  public destroy() {
    if (this.voiceConnection) this.voiceConnection.kill();
    this.emit('destroy');
  }
}

const CORRUPT_RANDSAMPLE_MINMAX_ABSOLUTE = 32767;
const CORRUPT_RANDSAMPLE_MINMAX_RELATIVE = 10;

export default class VoicePipeline extends Transform {
  public mixer?: Mixer;
  private _packetLoss = 0;
  private silent: boolean = false;
  private opus?: OpusEncoder;
  private opusLeftover? = Buffer.alloc(0);
  private opusPacketsReceived = 0;
  private opusPacketCheck = 0;
  private readonly connection: VoiceSafeConnection;
  private readonly logger: Logger;
  private readonly voice: NewVoice;

  public onVoiceServerUpdate: (
    payload: GatewayClientEvents.VoiceServerUpdate
  ) => void;
  public onVoiceStateUpdate: (
    payload: GatewayClientEvents.VoiceStateUpdate
  ) => void;

  constructor(voice: NewVoice, voiceChannel: Structures.ChannelGuildVoice) {
    super({ readableObjectMode: true });

    this.voice = voice;
    this.logger = new Logger(`VoicePipeline [${voiceChannel.guildId}]`);
    this.connection = new VoiceSafeConnection(voiceChannel);
    this.mixer = new Mixer();
    this.opus = new OpusEncoder(Constants.OPUS_SAMPLE_RATE, Constants.OPUS_AUDIO_CHANNELS);

    this.onConnectionDestroy = this.onConnectionDestroy.bind(this);
    this.onVoiceServerUpdate = this.connection.onVoiceServerUpdate;
    this.onVoiceStateUpdate = this.connection.onVoiceStateUpdate;

    this.connection.on('connected', () => this.emit('connected'));
    this.connection.on('packet', (packet) => this.emit('receive', packet));
    this.connection.on('destroy', this.onConnectionDestroy);
  }

  public get channel() {
    if (!this.connection || !this.connection.voiceConnection) return null;
    return this.connection.voiceConnection.channel;
  }

  public set bitrate(value: number) {
    if (this.opus) this.opus.setBitrate(Math.min(128e3, Math.max(2e3, value)));
  }

  public get bitrate(): number {
    if (this.opus) return this.opus.getBitrate();
    return -1;
  }

  public set packetLoss(value: number) {
    this._packetLoss = Math.min(100, Math.max(0, value));
  }

  public get packetLoss(): number {
    return this._packetLoss;
  }

  private onConnectionDestroy() {
    this.voice.kill(true);
  }

  public update() {
    const packet = this.read();
    const lost = this._packetLoss > 0 && Math.random() < this._packetLoss / 100;
    if (packet && !lost) {
      this.connection.sendAudio(packet);
      this.opusPacketsReceived++;
    }

    if (this.silent) this.write(Buffer.alloc(Constants.OPUS_REQUIRED_SAMPLES));

    const time = Date.now() - this.opusPacketCheck;
    if (time >= 1000) {
      this.logger.debug(
        'received',
        this.opusPacketsReceived,
        'over',
        time,
        'ms'
      );
      this.opusPacketsReceived = 0;
      this.opusPacketCheck = Date.now();
    }
  }

  public _transform(
    chunk: any,
    _: BufferEncoding,
    callback: TransformCallback
  ): void {
    if (!this.opus || !this.opusLeftover || !this.mixer) return callback();
    const buffer = this.mixer.process(chunk);

    this.opusLeftover = Buffer.concat([this.opusLeftover, buffer]);

    let n = 0;
    while (this.opusLeftover.length >= Constants.OPUS_REQUIRED_SAMPLES * (n + 1)) {
      const frame = this.opus.encode(
        this.opusLeftover.subarray(
          n * Constants.OPUS_REQUIRED_SAMPLES,
          (n + 1) * Constants.OPUS_REQUIRED_SAMPLES
        )
      );
      this.push(frame);
      n++;
    }
    // this.logger.debug('converted opus frames ', n);
    if (n > 0)
      this.opusLeftover = this.opusLeftover.subarray(n * Constants.OPUS_REQUIRED_SAMPLES);
    return callback();
  }

  public playSilence() {
    this.logger.debug('playSilence()');
    this.silent = true;
  }

  public stopSilence() {
    this.logger.debug('stopSilence()');
    this.silent = false;
  }

  public sendEmptyOpusPacket() {
    this.connection.sendEmpty();
  }

  public playBuffer(buffer: Buffer) {
    if (this.mixer) this.mixer.addReadable(buffer);
  }

  public clearReadableArray() {
    if (this.mixer) this.mixer.clearReadables();
  }

  public set volume(volume: number) {
    if (this.mixer) this.mixer.setVolume(volume / 100);
  }

  public get volume(): number {
    if (this.mixer) return Math.round(this.mixer.getVolume() * 100);
    return -1;
  }

  public set corrupt(corrupt: boolean) {
    if (!this.voice.allowCorrupt)
      throw new UserError('corrupt-mode-not-allowed');

    if (this.mixer) this.mixer.setCorruptEnabled(corrupt);
  }

  public get corrupt(): boolean {
    if (this.mixer) return this.mixer.getCorruptEnabled();
    return false;
  }

  public set corruptEvery(every: number) {
    if (this.mixer) this.mixer.setCorruptEvery(every);
  }

  public get corruptEvery() {
    if (this.mixer) return this.mixer.getCorruptEvery();
    return -1;
  }

  public set corruptMode(mode: string) {
    if (this.mixer)
      this.mixer.setCorruptMode(
        Constants.CorruptModeMappings[
          mode as keyof typeof Constants.CorruptModeMappings
        ] || 0
      );
  }

  public get corruptMode() {
    if (this.mixer)
      return (
        Constants.CorruptModeMappings[this.mixer.getCorruptMode()] || 'add'
      );
    return 'add';
  }

  public set corruptRandSample(randSample: number) {
    randSample = Math.max(
      Math.min(
        Math.floor(randSample),
        CORRUPT_RANDSAMPLE_MINMAX_RELATIVE
      ),
      -CORRUPT_RANDSAMPLE_MINMAX_RELATIVE
    );
    if (this.mixer)
      this.mixer.setCorruptRandSample(
        (randSample * CORRUPT_RANDSAMPLE_MINMAX_ABSOLUTE) /
          CORRUPT_RANDSAMPLE_MINMAX_RELATIVE
      );
  }

  public get corruptRandSample() {
    if (this.mixer)
      return Math.ceil(
        (this.mixer.getCorruptRandSample() /
          CORRUPT_RANDSAMPLE_MINMAX_ABSOLUTE) *
          CORRUPT_RANDSAMPLE_MINMAX_RELATIVE
      );
    return 1;
  }

  public destroy() {
    this.stopSilence();
    this.connection.off('destroy', this.onConnectionDestroy);
    this.connection.destroy();
    this.mixer = undefined;
    this.opus = undefined;
    this.opusLeftover = undefined;
    return super.destroy();
  }
}
