// expect: hnk(layer-imports) | job imports another domain's service. A job does not import services
import { thing } from "../domains/a/service";

export const run = () => thing;
