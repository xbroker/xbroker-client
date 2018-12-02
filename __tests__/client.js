/**
 *  Copyright (c) 2018, AMI System, LLC
 *  All rights reserved.
 *
 *  This source code is licensed under the MIT-style license found in the
 *  LICENSE file in the root directory of this source tree.
 *
 *  @flow
 */

import XBrokerClient from '../src/XBrokerClient'

const url = "ws://localhost:3555"
const agent = "redis"
var client

beforeEach(() => {
  client = new XBrokerClient(url)
})

afterEach(() => {
  client.close()
})

test("client.command", function(done) {
  client.command(agent, "exists", ["nosuchkey"], 
    (error, result) => {
      expect(error).toBeUndefined()
      expect(result).toBeDefined()
      expect(result).not.toBeNull()
      if(result) {
        expect(result).toEqual(expect.objectContaining({status: "ok"}))
        expect(result.result).toBe(0)
      }
      done()
    })
})

test("illegal command", function(done) {
  client.command(agent, "eexists", ["nosuchkey"], 
    (error, result) => {
      expect(error).toBeUndefined()
      expect(result).toBeDefined()
      expect(result).not.toBeNull()
      if(result) {
        expect(result.status).toBe("error")
        expect(result.errorMsg).toMatch(("ReplyError: ERR unknown command 'eexists'": any))
      }
      done()
    })
})

test("client.commandAsync - using async", async function() {
  const result = await client.commandAsync(agent, "keys", ["*"])
  expect(result).toEqual(expect.arrayContaining([]))
})

test("client.commandAsync - using promise", function() {
  return client.commandAsync(agent, "keys", ["*"])
  .then((result) => {
    expect(result).toEqual(expect.arrayContaining([]))
  })
})

test("connects to xbroker - with props", function() {
  const props = {
    maxSentCommandsCnt: 8,
    defaultTimeoutMs: 30000,
    maxReconnectIntervalMs: 15000,
    watchdogIntervalMs: 5000,
    batchResults: true
  }
    
  const broker = new XBrokerClient(url, props)

  broker.close()
})

test("reconnect", function() {
  const broker = new XBrokerClient(url)

  broker.close()

  broker.reconnect()
})

test("subscribe/unsubscribe - using async", async function() {
  var result = await client.commandAsync(agent, "subscribe", ["ABC"])
  expect(result).toEqual(expect.arrayContaining([]))

  result = await client.commandAsync(agent, "unsubscribe", ["ABC"])
  expect(result).toEqual(expect.arrayContaining([]))
})

test("psubscribe/punsubscribe - using async", async function() {
  var result = await client.commandAsync(agent, "psubscribe", ["ABC1"])
  expect(result).toEqual(expect.arrayContaining([]))

  result = await client.commandAsync(agent, "punsubscribe", ["ABC1"])
  expect(result).toEqual(expect.arrayContaining([]))
})

test("subscribe twice", async function() {
  var result = await client.commandAsync(agent, "subscribe", ["ABC2"])
  expect(result).toEqual(expect.arrayContaining([]))

  try {
    result = await client.commandAsync(agent, "subscribe", ["ABC2"])
  } catch(error) {
    expect(error.status).toBe('error')
    expect(error.errorMsg).toMatch(('Channel already subscribed: ': any))
  }
})

test("psubscribe twice", async function() {
  var result = await client.commandAsync(agent, "psubscribe", ["ABC3"])
  expect(result).toEqual(expect.arrayContaining([]))

  try {
    result = await client.commandAsync(agent, "psubscribe", ["ABC3"])
  } catch(error) {
    expect(error.status).toBe('error')
    expect(error.errorMsg).toMatch(('Pattern already subscribed: ': any))
  }
})

test("setMessage", function() {
  const setMessage = (message) => {
    expect(message).toMatch(("": any))
  }

  const props = {
    setMessage: setMessage
  }
    
  const broker = new XBrokerClient(url, props)

  broker.close()
})

test("changeState", function() {
  const changeState = (state) => {
    expect(state).toMatch(("": any))
  }

  const props = {
    changeState: changeState
  }
    
  const broker = new XBrokerClient(url, props)

  broker.close()
})
