const html = require('choo/html')

function zeroPad (number) {
  const padding = number < 10 ? '0' : ''
  return padding + number
}

function renderLastest (state) {
  const data = state.data
  const recentData = data[data.length - 1]

  if (!recentData) return ''

  const time = new Date(recentData.timestamp)

  const sensors = recentData.stoker.sensors || []
  let sensorEls
  if (sensors.length) {
    sensorEls = sensors.map((temp) =>
      html`<tr><td>${temp.name}</td><td>${temp.tempCurrent}ºF</td></tr>`)
  } else {
    sensorEls = html`<tr><td colspan="100%">No Sensors Found</td></tr>`
  }

  const blowers = recentData.stoker.blowers || []
  let blowerEls
  if (blowers.length) {
    blowerEls = blowers.map((blower) =>
      html`<tr><td>${blower.name}</td><td>${(blower.on) ? 'On' : 'Off'}</td></tr>`)
  } else {
    blowerEls = html`<tr><td colspan="100%">No Blowers Found</td></tr>`
  }

  return html`
<table>
  <tr><td colspan=2>Last Update ${time.getHours() + ':' + zeroPad(time.getMinutes()) + ':' + zeroPad(time.getSeconds())}</td></tr>
  <tr><td colspan=2><b>Sensors</b></td></tr>
  ${sensorEls}
  <tr><td colspan=2><b>Blowers</b></td></tr>
  ${blowerEls}
</table>`
}

module.exports = renderLastest
