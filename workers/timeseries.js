export class TimesSeries {
  /**
   * @param {HyperDB}
   */
  constructor (db) {
    this.db = db
    this.ns = 'stoker-app'
  }

  async addDatapoint (series, value, timestamp = new Date()) {
    const seriesId = await this.db.get(`@${this.ns}/series-ids`, series)
    console.log('seriesId', seriesId)
    return this.db.insert(`@${this.ns}/series-data`, { 'series-id': seriesId, value, timestamp })
  }
}
