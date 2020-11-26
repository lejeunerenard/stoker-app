const Stoker = require('../')
const fs = require('fs')
const path = require('path')

const stoker = new Stoker('192.168.1.31')
const today = new Date()
const filename = today.getFullYear() + '-' + today.getMonth() + '-' + today.getDate() + '.json'

const currentSessionData = []

stoker.on('temp', (data) => {
  console.log(data.name + ' : ' + data.temperature)
})

stoker.on('data', (data) => {
  currentSessionData.push(data)
  const json = JSON.stringify(currentSessionData, null, 2)
  fs.writeFileSync(path.join('.', filename), json, 'utf8')
})

const sensorsConnectedToBlower = ['01000012C22AA130']
stoker.setBlower(false, sensorsConnectedToBlower)
