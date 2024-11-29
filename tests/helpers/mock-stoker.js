const express = require('express')
module.exports = class MockStoker {
  constructor () {
    this.app = express()
    this.app.get('/stoker.json', (_, res) => {
      res.send(JSON.stringify({
        stoker: {
          sensors: []
        }
      }))
    })
  }

  listen (...args) {
    return this.app.listen(...args)
  }
}
