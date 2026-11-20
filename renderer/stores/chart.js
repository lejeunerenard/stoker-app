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
      // DB chunks deliver arrays of {x,y} points per label; single values
      // still accepted for non-DB callers
      const values = Array.isArray(value) ? value : [value]

      // TODO unbounded: every point ever streamed stays in the dataset and is
      // redrawn on each update (the hyperdb is the ledger this view could
      // window)
      let found = false
      for (let i = 0; i < chart.data.datasets.length; i++) {
        const dataset = chart.data.datasets[i]
        if (dataset.label === label) {
          found = true
          for (const value of values) {
            dataset.data.push(value)
          }
          break
        }
      }

      if (!found) {
        const opt = Object.assign({}, {
          label,
          data: values.slice(0),
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
