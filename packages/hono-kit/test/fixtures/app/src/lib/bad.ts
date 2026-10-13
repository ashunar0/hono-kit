// expect: hnk(layer-imports) | lib imports another module's model
import { thing } from "../domains/s1/model";

export const leaked = thing;
