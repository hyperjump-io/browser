export class FileUrlSchemePlugin {
  constructor() {
    throw Error("The 'file:' URL scheme is not supported in this environment");
  }
}
