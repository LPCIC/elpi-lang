export default class Unreachable extends Error {
  constructor(proof: never) {
    super(`This code path was assumed to be unreachable, but object was not handled: ${proof}`)
  }
}
