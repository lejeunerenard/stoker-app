const fs = require('fs')
const path = require('path')

function loadSessions (dir) {
  const sessions = []
  const files = fs.readdirSync(dir)
  for (const file of files) {
    // Only parse json files
    if (!file.match(/\.json$/)) continue

    try {
      const data = JSON.parse(fs.readFileSync(path.join(dir, file)))
      sessions.push(data)
    } catch (e) {
      console.warn('Failed to load ' + file)
      console.warn(e)
    }
  }

  return sessions
}

function createSession (name) {
  const today = new Date()
  if (!name) {
    name = today.getFullYear() + '-' + (today.getMonth() + 1) + '-' + today.getDate()
  }

  const filename = name + '.json'

  return {
    name,
    filename,
    createdTimestamp: today,
    data: []
  }
}

function saveSession (session, dir) {
  const json = JSON.stringify(session.data, null, 2)
  fs.writeFileSync(path.join(dir, session.filename), json, 'utf8')
}
module.exports = { loadSessions, createSession, saveSession }
