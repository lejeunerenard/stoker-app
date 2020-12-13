const Chart = require('chart.js')
const axios = require('axios').default

const { PORT, WS_PORT } = require('../variables.json')

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

function renderChart (data, render = true) {
  if (!chart) initChart()

  const time = new Date(data.timestamp)
  chart.data.labels.push(time.getHours() + ':' + zeroPad(time.getMinutes()) + ':' + zeroPad(time.getSeconds()))
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
  return data.stoker.sensors.reduce((prev, data) => {
    prev[data.name] = data.tempCurrent
    return prev
  }, {})
}

const temps = document.createElement('div')
document.body.appendChild(temps)

const ws = new WebSocket('ws://' + (window.location.hostname ? window.location.hostname : 'localhost') + ':' + WS_PORT)
ws.onopen = () => {
  console.log('ws connected')
}

ws.onmessage = ({ data }) => {
  data = JSON.parse(data)
  renderChart(data)

  let output = '<table>'

  const time = new Date(data.timestamp)
  output += `<tr><td colspan=2>Last Update ${time.getHours() + ':' + zeroPad(time.getMinutes()) + ':' + zeroPad(time.getSeconds())}</td></tr>`
  output += '<tr><td colspan=2><b>Sensors</b></td></tr>'
  for (const temp of data.stoker.sensors) {
    output += `<tr><td>${temp.name}</td><td>${temp.tempCurrent}ºF</td></tr>`
  }

  output += '<tr><td colspan=2><b>Blowers</b></td></tr>'
  for (const blower of data.stoker.blowers) {
    output += `<tr><td>${blower.name}</td><td>${(blower.on) ? 'On' : 'Off'}</td></tr>`
  }

  output += '</table>'

  temps.innerHTML = output
}

axios.get(`http://localhost:${PORT}/data`)
  .then((response) => {
    const data = response.data
    for (let i = 0; i < data.length; i++) {
      const datapoint = data[i]
      const update = i === data.length - 1
      renderChart(datapoint, update)
    }
  })
