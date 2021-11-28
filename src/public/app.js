const Chart = require('chart.js')
const axios = require('axios').default
const EventEmitter = require('events').EventEmitter

const { PORT } = require('../variables.json')

let chart = null

function initChart () {
  const canvas = document.querySelector('canvas')
  const ctx = canvas.getContext('2d')
  chart = new Chart(ctx, {
    type: 'line',
    options: {
      tooltips: {
        mode: 'index',
        intersect: false
      },
      hover: {
        mode: 'nearest',
        intersect: true
      },
      scales: {
        xAxes: [{
          type: 'time'
        }]
      }
    }
  })
}

function zeroPad (number) {
  const padding = number < 10 ? '0' : ''
  return padding + number
}

function getOptions (index) {
  const colors = [[255, 0, 0], [0, 255, 0], [0, 0, 255]]

  const color = colors[index % colors.length]

  return {
    backgroundColor: `rgba(${color[0]}, ${color[1]}, ${color[2]}, 0.1)`,
    borderColor: `rgba(${color[0]}, ${color[1]}, ${color[2]}, 0.9)`
  }
}

function clearChart () {
  if (!chart) return

  chart.data.datasets = []
  chart.update()
}

function renderChart (data, render = true) {
  if (!chart) initChart()

  const datapoints = massageData(data)

  for (const [label, value] of Object.entries(datapoints)) {
    // Attempt to find an existing dataset
    let found = false
    for (let i = 0; i < chart.data.datasets.length; i++) {
      const dataset = chart.data.datasets[i]
      if (dataset.label === label) {
        found = true
        dataset.data.push(datapoints[label])
        break
      }
    }

    if (!found) {
      const opt = Object.assign({}, {
        label,
        data: [value],
        fill: false
      }, getOptions(chart.data.datasets.length))

      chart.data.datasets.push(opt)
    }
  }

  if (render) {
    chart.update()
  }
}

function massageData (data) {
  if (data.stoker.sensors) {
    return data.stoker.sensors.reduce((prev, sensor) => {
      prev[sensor.name] = { x: (new Date(data.timestamp)).getTime(), y: sensor.tempCurrent }
      return prev
    }, {})
  }

  return []
}

const info = document.createElement('div')
document.body.appendChild(info)

const state = {
  data: [],
  stokerIP: null,
  errors: [],
  sessions: [],
  sessionID: null
}

function render (state) {
  let output = ''
  for (const error of state.errors) {
    output += '<div class="error">' + error + '</div>'
  }

  // Sessions
  output += `<div class="session-manager">
    <label for="session">Session</label>
    <select id="session">`
  for (let i = 0; i < state.sessions.length; i++) {
    const session = state.sessions[i]
    output += `<option value="${i}"${i === state.sessionID ? ' selected' : ''}>${session.name}</option>`
  }
  output += `</select>
    </div>`

  output += renderLastest(state)
  info.innerHTML = output
}

function renderLastest (state) {
  const data = state.data
  const recentData = data[data.length - 1]

  if (!recentData) return ''

  let output = '<table>'

  const time = new Date(recentData.timestamp)
  output += `<tr><td colspan=2>Last Update ${time.getHours() + ':' + zeroPad(time.getMinutes()) + ':' + zeroPad(time.getSeconds())}</td></tr>`
  output += '<tr><td colspan=2><b>Sensors</b></td></tr>'
  if (recentData.stoker.sensors) {
    for (const temp of recentData.stoker.sensors) {
      output += `<tr><td>${temp.name}</td><td>${temp.tempCurrent}ºF</td></tr>`
    }
  } else {
    output += '<tr><td colspan="100%">No Sensors Found</td></tr>'
  }

  output += '<tr><td colspan=2><b>Blowers</b></td></tr>'
  if (recentData.stoker.blowers) {
    for (const blower of recentData.stoker.blowers) {
      output += `<tr><td>${blower.name}</td><td>${(blower.on) ? 'On' : 'Off'}</td></tr>`
    }
  } else {
    output += '<tr><td colspan="100%">No Blowers Found</td></tr>'
  }

  output += '</table>'
  return output
}

const appBus = new EventEmitter()

function initState () {
  // Stoker IP
  appBus.once('store:get:stokerIP', (event, ip) => {
    if (ip) {
      state.stokerIP = ip
      render(state)
    }
  })
  appBus.on('stoker:not-found', () => {
    state.errors = []
    state.errors.push(`Stoker cannot be found at ${state.stokerIP}`)
    render(state)
  })

  // Update state w/ new data
  appBus.on('data', (data) => {
    renderChart(data)
    state.data.push(data)
    render(state)
  })

  getSessions().then(() => {
    state.sessionID = state.sessions.length - 1
    render(state)
    getSession('current')
  })

  render(state)
}

initState()

function onChangeSession (e) {
  e.preventDefault()

  const id = Number(e.target.value)
  state.sessionID = id

  getSession(id)
}

document.body.addEventListener('change', (e) => {
  if (e.target.id !== 'session') return

  onChangeSession(e)
})

function setupWS (port, bus) {
  const ws = new WebSocket('ws://' + (window.location.hostname ? window.location.hostname : 'localhost') + ':' + port)
  ws.onopen = () => {
    console.log('ws connected')
    bus.on('store:get', (field) => {
      ws.send(JSON.stringify({ event: 'store:get', data: field }))
    })

    // Now connection is open, get info
    bus.emit('store:get', 'stokerIP')
  }

  ws.onmessage = ({ data }) => {
    data = JSON.parse(data)
    bus.emit(data.event, data.data)
  }
}

function getWSPort () {
  axios.get(`http://${window.location.hostname ? window.location.hostname : 'localhost'}:${PORT}/ws-port`)
    .then((response) => {
      const port = response.data
      setupWS(port, appBus)
    })
}

getWSPort()
function getSession (id) {
  if (id === undefined) throw Error('no id provided to getSession()')

  axios.get(`http://${window.location.hostname ? window.location.hostname : 'localhost'}:${PORT}/data/${id}`)
    .then((response) => {
      clearChart()
      const session = response.data
      const data = session.data
      for (let i = 0; i < data.length; i++) {
        const datapoint = data[i]
        const update = i === data.length - 1
        renderChart(datapoint, update)
      }
    })
}

function getSessions () {
  return axios.get(`http://${window.location.hostname ? window.location.hostname : 'localhost'}:${PORT}/sessions`)
    .then((response) => {
      state.sessions = response.data
    })
}
