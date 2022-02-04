'use strict'

const async = require('async')
const Base = require('bfx-wrk-base')
const path = require('path')

class WrkApi extends Base {
  init () {
    super.init()

    /** @type {import('bfx-facs-grc')} */
    this.grc_bfx
    /** @type {import('bfx-facs-api')} */
    this.api_bfx

    this.setInitFacs([
      ['fac', 'bfx-facs-grc', 'p0', 'bfx', () => {
        return this.getGrcConf()
      }, 2],
      ['fac', 'bfx-facs-api', 'bfx', 'bfx', () => {
        return this.getApiConf()
      }]
    ])
  }

  /**
   * @returns {{svc_port: number, services: ReturnType<WrkApi['getGrcServices']>}}
   */
  getGrcConf () {
    return {
      svc_port: this.ctx.apiPort || 0,
      services: this.getGrcServices()
    }
  }

  /**
   * @returns {null|any[]}
   */
  getGrcServices () {
    const group = this.group
    const conf = this.conf[group]

    if (conf && Array.isArray(conf.grcServices)) {
      return conf.grcServices
    }

    return null
  }

  /**
   * @returns {{path: string}}
   */
  getApiConf () {
    const wrk = path.basename(this.ctx.worker, '.js')
    const tmp = wrk.split('.')
    tmp.pop()
    tmp.shift()

    const inferred = tmp.join('.')
    return {
      path: inferred
    }
  }

  /**
   * @param {string} type 
   * @returns {{rootPath: string, grc_bfx?: any}}
   */
  getPluginCtx (type) {
    const ctx = super.getPluginCtx(type)

    switch (type) {
      case 'api_bfx':
        ctx.grc_bfx = this.grc_bfx
        break
    }

    ctx.rootPath = this.ctx.root

    return ctx
  }

  /**
   * @param {function(null|Error, any): any} cb
   * @returns {void}
   */
  _start (cb) {
    async.series([ next => { super._start(next) },
      next => {
        if (this.api_bfx) {
          this.grc_bfx.set('api', this.api_bfx.api)
        }

        next()
      }
    ], cb)
  }
}

module.exports = WrkApi
