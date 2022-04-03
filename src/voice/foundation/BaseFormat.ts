import { ExtendedReadable } from '..'

export default class BaseFormat {
  public regex = /.+/g
  public printName = 'unknown'
  public readonly formatCredentials: IConfigFormatCredentials;

  constructor (formatCredentials: IConfigFormatCredentials) {
    this.formatCredentials = formatCredentials;
  }

  public onMatch (_matched: string): Promise<(() => ExtendedReadable) | (() => Promise<ExtendedReadable>) | ExtendedReadable[] | ExtendedReadable | false>
    | (() => ExtendedReadable) | (() => Promise<ExtendedReadable>) | ExtendedReadable[] | ExtendedReadable | false {
    return false
  }
}
