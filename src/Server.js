import WebSocketAsPromised from 'websocket-as-promised'

export const ws = new WebSocketAsPromised('wss://hometask.eg1236.com/game1/')
const listeners = []

export function start (level) {
  ws.send(`new ${level}`)
}

export function map () {
  ws.send('map')
}

export function open (x, y) {
  ws.send(`open ${x} ${y}`)
}

export function onMessage (listener) {
  listeners.push(listener)
}

ws.onmessage = function (event) {
  notify(event.data)
}

function notify (data) {
  listeners.forEach(listener => listener(data))
}
