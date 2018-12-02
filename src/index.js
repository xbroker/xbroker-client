/**
 *  Copyright (c) 2018, AMI System, LLC
 *  All rights reserved.
 *
 *  This source code is licensed under the MIT-style license found in the
 *  LICENSE file in the root directory of this source tree.
 *
 *  @flow
 */

import XBrokerClient from './XBrokerClient'

const createClient = (url: string, props: any): XBrokerClient =>
  new XBrokerClient(url, props)

export {
  createClient
}

export default {
  createClient
}
