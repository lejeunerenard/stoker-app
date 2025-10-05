import Chart from 'chart.js'

export function chartStore (_, emitter) {
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

  function getOptions (index) {
    const colors = [[255, 0, 0], [0, 255, 0], [0, 0, 255]]

    const color = colors[index % colors.length]

    return {
      backgroundColor: `rgba(${color[0]}, ${color[1]}, ${color[2]}, 0.1)`,
      borderColor: `rgba(${color[0]}, ${color[1]}, ${color[2]}, 0.9)`
    }
  }

  emitter.on('chart:clear', () => {
    if (!chart) return

    chart.data.datasets = []
    chart.update()
  })

  emitter.on('chart:render', (data, render = true) => {
    if (!chart) initChart()

    for (const [label, value] of Object.entries(data)) {
      // Attempt to find an existing dataset
      let found = false
      for (let i = 0; i < chart.data.datasets.length; i++) {
        const dataset = chart.data.datasets[i]
        if (dataset.label === label) {
          found = true
          dataset.data.push(value)
          break
        }
      }

      if (!found) {
        const opt = Object.assign({}, {
          label,
          data: [value],
          fill: false,
          parsing: false
        }, getOptions(chart.data.datasets.length))

        chart.data.datasets.push(opt)
      }
    }

    if (render) {
      chart.update()
    }
  })
}
