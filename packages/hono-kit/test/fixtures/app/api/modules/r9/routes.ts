// expect: hnk(layer-imports) | routes imports another module's errors. Do not borrow another module's entry-point failures
import { BFailed } from "../b/errors";

const borrowed = BFailed;
void borrowed;
