import html from 'choo/html'

function zeroPad (number) {
  const padding = number < 10 ? '0' : ''
  return padding + number
}

// Reads the stoker store's `latest` map (field name → datapoint) and
// `lastUpdate`. Blowers are fields named `blower-<id>` with 0/1 values
// (timeseries-db stores ints; temps are scaled ×10 on write, ÷10 on read)
export function renderLatest (state) {
  const latest = state.latest
  if (!latest) return ''

  const points = Object.values(latest)
  if (!points.length) return ''

  const time = state.lastUpdate ? new Date(state.lastUpdate) : null

  const sensorPoints = points.filter((p) => p.name.indexOf('blower-') !== 0)
  let sensorEls
  if (sensorPoints.length) {
    sensorEls = sensorPoints.map((p) =>
      html`<tr><td>${p.name}</td><td>${p.tempCurrent}ºF</td></tr>`)
  } else {
    sensorEls = html`<tr><td colspan="100%">No Sensors Found</td></tr>`
  }

  const blowerPoints = points.filter((p) => p.name.indexOf('blower-') === 0)
  let blowerEls
  if (blowerPoints.length) {
    blowerEls = blowerPoints.map((p) =>
      html`<tr><td>${p.name}</td><td>${p.tempCurrent ? 'On' : 'Off'}</td></tr>`)
  } else {
    blowerEls = html`<tr><td colspan="100%">No Blowers Found</td></tr>`
  }

  const timeCell = time
    ? time.getHours() + ':' + zeroPad(time.getMinutes()) + ':' + zeroPad(time.getSeconds())
    : '—'

  return html`
<table>
  <tr><td colspan=2>Last Update ${timeCell}</td></tr>
  <tr><td colspan=2><b>Sensors</b></td></tr>
  ${sensorEls}
  <tr><td colspan=2><b>Blowers</b></td></tr>
  ${blowerEls}
</table>`
}
