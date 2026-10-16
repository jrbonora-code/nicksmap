export class WorkspaceUnavailableError extends Error {
  constructor() {
    super("The private workspace database is not ready. Configure DATABASE_URL and run the explicit database migrations, then retry.");
    this.name = "WorkspaceUnavailableError";
  }
}

export class WorkspaceValidationError extends Error {
  readonly fields: Record<string, string>;
  constructor(message: string, fields: Record<string, string> = {}) {
    super(message);
    this.name = "WorkspaceValidationError";
    this.fields = fields;
  }
}
