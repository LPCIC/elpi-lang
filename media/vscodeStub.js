window.acquireVsCodeApi = () => ({
  postMessage: (...args) => {
    console.log('"Handling" message', ...args)
  }
})
