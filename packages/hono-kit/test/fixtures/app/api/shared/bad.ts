// expect: hnk(layer-imports) | shared imports another module's domain
import { thing } from "../modules/s1/domain";

export const leaked = thing;
