import html from 'choo/html'

const defaultInputClasses = 'input-reset ba b--black-20 bg-transparent pa2 mb2 db w-100 border-box'

function dateToLocal (date) {
  if (typeof date === 'string' || !date) return date
  const timezoneMS = date.getTimezoneOffset() * 60 * 1000
  const localDate = new Date(date - timezoneMS)
  const isoStr = localDate.toISOString()
  const noMilliStr = isoStr.split('.')[0]
  return noMilliStr.replace(/:\d{2}$/, '')
}

function fieldContainer (field) {
  return html`<div class="measure mv2">
    ${field}
  </div>`
}

function optionalFieldContainer (el, opts) {
  opts = Object.assign({}, {
    container: true
  }, opts)
  return opts.container ? fieldContainer(el) : el
}

function labelEl (name, text, attributes) {
  const combinedAttributes = Object.assign({}, {
    class: 'f6 b db mb2'
  }, attributes)
  return html`<label for="${name}" ${combinedAttributes}>${text}</label>`
}

export function inputField (name, label, value, attributes, type = 'text', opts) {
  const combinedAttributes = Object.assign({}, {
    class: defaultInputClasses
  }, attributes)
  return optionalFieldContainer(html`
  ${labelEl(name, label)}
  <input id="${name}" type="${type}" name="${name}" value="${value}"
    ${combinedAttributes}>
`, opts)
}

function checkboxField (name, label, value, attributes, opts) {
  const combinedAttributes = Object.assign({}, {
    class: defaultInputClasses
  }, attributes)

  // Cast checked to boolean
  if ('checked' in combinedAttributes) combinedAttributes.checked = !!combinedAttributes.checked

  return optionalFieldContainer(html`
  <input id="${name}" type="checkbox" name="${name}" value="${value}"
    ${combinedAttributes}>
  ${labelEl(name, label, { class: 'lh-copy' })}
`, opts)
}

function selectField (name, label, options, attributes, selected = [], opts) {
  const combinedAttributes = Object.assign({}, {
    class: defaultInputClasses
  }, attributes)

  return optionalFieldContainer(html`
    ${labelEl(name, label)}
    <select id="${name}" name="${name}" ${combinedAttributes}>
      ${options.map((option) =>
        html`<option value=${option.value}
      ${selected.indexOf(option.value) !== -1 ? 'selected' : ''}>${option.text || option.value}</option>`)}
    </select>
  `, opts)
}

export function textField (name, label, value, attributes) {
  return inputField(name, label, value, attributes, 'text')
}

function passwordField (name, label, value, attributes) {
  return inputField(name, label, value, attributes, 'password')
}

function numberField (name, label, value, attributes) {
  return inputField(name, label, value, attributes, 'number')
}

function dateLocalField (name, label, value, attributes, opts) {
  return inputField(name, label, dateToLocal(value), Object({
    class: 'b pa2 input-reset ba bg-transparent w-100'
  }, attributes), 'datetime-local')
}

function dateField (name, label, value, attributes, opts) {
  return inputField(name, label, value, attributes, 'date')
}

function fileField (name, label, value, attributes) {
  return inputField(name, label, value, attributes, 'file')
}

// based on https://codepen.io/nielsenramon/pen/bLPwRQ
function toggleField (name, label, value, attributes = {}) {
  attributes.checked = !!value
  return html`
  ${labelEl(name, label, { class: 'dib mr2 helvetica' })}
  <div class="relative dib">
    <input class="absolute z-5 w-100 h-100 o-0 pointer checkbox" type="checkbox"
      value="${value}" id="${name}" name="${name}" ${attributes}>
    <div class="relative z-4 dib w3 h2 bg-gray overflow-hidden br4 v-mid bg-animate checkbox-wrapper">
      <div class="absolute right-auto left-0 w2 h2 br4 bg-silver shadow-4 t-cb checkbox-toggle"></div>
    </div>
  </div>
    `
}

// Style
function hideable (el, hide) {
  const style = el.style
  // Skip elements already setting display
  if ('display' in style && style.display) return el

  if (hide) el.style.display = 'none'

  return el
}
