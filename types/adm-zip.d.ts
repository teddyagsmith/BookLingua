declare module 'adm-zip' {
  class AdmZip {
    constructor(buffer?: Buffer);
    getEntries(): Array<{
      entryName: string;
      getData(): Buffer;
    }>;
  }
  export default AdmZip;
}
