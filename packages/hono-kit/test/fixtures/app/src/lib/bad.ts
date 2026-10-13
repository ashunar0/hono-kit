// expect: hnk(layer-imports) | lib imports another module's domain
import { thing } from "../domains/s1/domain";

export const leaked = thing;
