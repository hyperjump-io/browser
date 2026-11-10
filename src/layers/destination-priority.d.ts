import type { Decorator, FetchContext, Fetcher, Layer } from "../layers.d.ts";
import type { Priority } from "../priority.d.ts";

/**
 * About what browsers do: what's needed to show a page is `high`, images and
 * media are `low`, and the rest stays `auto`
 */
export const defaultDestinationPriorities: Readonly<Record<string, Priority>>;

/**
 * Gives a request a priority by its destination, the way a browser loads
 * stylesheets before images without being told. It's only for requests
 * whose priority is `"auto"`, so a priority the caller chose wins, and a
 * request follows its caller's priority if that changes later.
 */
export class DestinationPriority implements Layer {
  constructor(inner: Fetcher, priorities?: Record<string, Priority>);

  readonly inner: Fetcher;
  readonly priorities: Readonly<Record<string, Priority>>;

  fetch(request: Request, ctx: FetchContext): Promise<Response>;
}

export const destinationPriority: (priorities?: Record<string, Priority>) => Decorator<DestinationPriority>;
