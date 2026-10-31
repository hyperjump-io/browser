export class FileUriSchemePlugin {
  constructor() {
    throw Error("The 'file:' URI scheme is not supported in this environment");
  }
}
