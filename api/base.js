'use strict'

const fs = require('fs')
const _ = require('lodash')

/**
 * @typedef IAuth
 * @property {string} fingerprint
 */

class Api {
  constructor (caller, opts = {}) {
    this.caller = caller
    this.opts = opts

    this.init()
  }

  init () {}

  /**
   * @param {string} service 
   * @param {any} msg 
   * @returns {{service: string, svp: string[]}}
   */
  _space (service, msg) {
    return {
      service: service,
      svp: service.split(':')
    }
  }

  /**
   * @returns {boolean}
   */
  isCtxReady () {
    return !!this.ctx
  }

  /**
   * @returns {void}
   */
  clearCtx () {
    this.ctx = null
  }

  /**
   * @returns {void}
   */
  loadAcl () {
    if (this.acl) {
      return
    }

    const rootPath = this.ctx.rootPath

    let acl = null
    try {
      acl = JSON.parse(fs.readFileSync(`${rootPath}/sec/acl.json`))
      if (!_.isObject(acl)) {
        acl = null
      }
    } catch (err) {
      console.error(err)
    }

    this.acl = acl
  }

  /**
   * @param {string} fingerprint 
   * @param {string} action 
   * @param {any} args 
   * @returns {boolean}
   */
  checkAcl (fingerprint, action, args) {
    if (!this.acl) {
      return false
    }

    let acl = this.acl

    if (acl['*']) {
      return true
    }

    if (!_.isObject(acl) || !acl[fingerprint]) {
      return false
    }

    acl = acl[fingerprint]

    if (acl['*']) {
      return true
    }

    if (!_.isObject(acl) || !acl[action]) {
      return false
    }

    return true
  }

  /**
   * @param {IAuth} auth 
   * @param {string} action 
   * @param {any} args 
   * @returns 
   */
  auth (auth, action, args) {
    if (!auth) {
      return false
    }

    this.loadAcl()

    const valid = this.checkAcl(auth.fingerprint, action, args)

    const rootPath = this.ctx.rootPath

    fs.appendFileSync(`${rootPath}/sec/acl.log`, `${auth.fingerprint}|${action}\n`)

    return valid
  }

  /**
   * @param {string} action 
   * @returns {false|string}
   */
  getStreamHandler (action) {
    if (!action) return false

    if (!action || _.startsWith(action, '_') || !this[action]) {
      return false
    }

    if (!_.endsWith(action, 'Stream')) {
      return false
    }

    return action
  }

  /**
   * @template T
   * @param {string} service 
   * @param {string} action 
   * @param {any} req 
   * @param {any} res 
   * @param {any} meta 
   * @param {function(null|Error, any): T} cb
   * @returns {T}
   */
  handleStream (service, action, req, res, meta, cb) {
    if (!this.ctx) {
      this.ctx = this.caller.getCtx()
    }

    const { args, _isSecure, _auth } = meta
    if (!this.isCtxReady()) {
      return cb(new Error('ERR_API_READY'))
    }

    if (_isSecure && !this.auth(_auth, action, args)) {
      return cb(new Error('ERR_API_AUTH'))
    }

    const space = this._space(service, null)
    const method = this[action]
    method.call(this, space, req, res, meta, cb)
  }

  /**
   * @template T
   * @param {string} service 
   * @param {{action: string, args: any[], _isSecure: any, _auth: IAuth}} msg 
   * @param {function(null|Error, any): T} cb 
   * @returns {T}
   */
  handle (service, msg, cb) {
    if (!this.ctx) {
      this.ctx = this.caller.getCtx()
    }

    if (!this.isCtxReady()) {
      return cb(new Error('ERR_API_READY'))
    }

    const action = msg.action
    if (!action || _.startsWith(action, '_') || !this[action]) {
      return cb(new Error('ERR_API_ACTION_NOTFOUND'))
    }

    if (!_.isFunction(cb)) {
      return cb(new Error('ERR_API_CB_INVALID'))
    }

    let isExecuted = false

    let args = _.isArray(msg.args) ? msg.args : []

    if (msg._isSecure && !this.auth(msg._auth, action, args)) {
      return cb(new Error('ERR_API_AUTH'))
    }

    args.unshift(this._space(service, msg))

    args = args.concat((err, res) => {
      if (isExecuted) {
        console.error('[CRITICAL] callback called twice')
        return
      }

      isExecuted = true
      cb(_.isError(err) ? new Error(err.message || 'ERR_API_BASE') : err, res)
    })

    const method = this[action]

    try {
      method.apply(this, args)
    } catch (e) {
      isExecuted = true
      console.error(e)
      cb(new Error(`ERR_API_ACTION: ${e.message}`))
    }
  }
}

module.exports = Api
