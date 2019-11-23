import React, { memo, useState, useEffect, useCallback } from 'react';
import './App.css';
import { ws } from './Server'


function App() {
  const [map, setMap] = useState([ [] ])
  const [bombCoords, setBombCoords] = useState({})
  const [opened, setOpened] = useState({})
  const [won, setWon] = useState(false)
  const [show, setShow] = useState(true)

  useEffect(() => {
    const effect = async () => {
      await ws.open()
      await ws.send('new 3')
      await ws.send('map')
      ws.onMessage.addListener(message => {
        console.log(message)
        window.a = message
        if (message.includes('won')) setWon(true)
        if (message.startsWith('map')) {
          if (won) return
          console.log('received new map')
          let [, ...lines] = message.split('\n')
          lines = lines.slice(0, lines.length - 1)
          setMap(lines.map(line => line.split('')))
        }
      })
    }
    effect()
  }, [])

  useEffect(() => {
    assist()
  }, [
    map,
    bombCoords,
  ])

  function getNeighbours (lineIndex, columnIndex) {
    const directions = [
      [-1, -1],
      [-1,  0],
      [-1, +1],
      [ 0, +1],
      [+1, +1],
      [+1,  0],
      [+1, -1],
      [ 0, -1],
    ]

    return directions.filter(([i, j]) =>
      (lineIndex + i) >= 0 && (lineIndex + i) <= map.length - 1 &&
      (columnIndex + j) >= 0 && (columnIndex + j) <= map[0].length - 1
    ).map(([i, j]) => [lineIndex + i, columnIndex + j])
  }

  function isClosed ([i, j]) {
    return map[i][j] === '□'
  }

  function getClosed (cells) {
    let result = []
    for (let k = 0; k < cells.length; k++) {
      const [i, j] = cells[k]
      if (isClosed([i, j]) && !isOpened([i, j])) {
        result.push([i, j])
      }
    }
    return result
  }

  function isOpened ([i, j]) {
    return opened[[i, j]] || !isClosed([i, j])
  }

  function isBomb ([i, j]) {
    return bombCoords[[i, j]]
  }

  async function openCell ([i, j], refetchMap = false) {
    if (isOpened([i, j])) return

    console.log('openCell ', i, ' ', j)
    setOpened(opened => ({
      ...opened,
      [[i, j]]: true,
    }))

    ws.send(`open ${j} ${i}`)

    if (refetchMap) await ws.send('map')
  }

  function batchOpen (cells) {
    const newOpened = cells.reduce((reduced, curr) => ({
      ...reduced,
      [[curr]]: true,
    }), {})

    setOpened(opened => ({
      ...opened,
      ...newOpened,
    }))

    let i = cells.length
    let used = false
    cells.forEach(([i, j]) => ws.send(`open ${j} ${i}`))
    ws.onMessage.addListener(message => {
      if (i !== 0 && message.includes('open: OK')) {
        console.log(`Awaited, ${i} left`)
        i--
      }
      if (i === 0 && !used) {
        console.log('awaited! fetching map...')
        used = true
        ws.send('map')
      }
    })
  }

  function countBombs (cells) {
    let result = 0
    for (let k = 0; k < cells.length; k++) {
      const [i, j] = cells[k]
      if (isBomb([i, j])) {
        result++
      }
    }
    return result
  }

  function setBomb ([i, j]) {
    console.log('setBomb ', i, ' ', j)
    setBombCoords(bombCoords => ({
      ...bombCoords,
      [[i, j]]: true,
    }))
  }

  function batchMarkAsBomb (coords) {
    const bombs = coords.reduce((reduced, curr) => ({
      ...reduced,
      [[curr]]: true
    }), {})
    setBombCoords(bombCoords => ({
      ...bombCoords,
      ...bombs,
    }))
  }

  function assist () {
    console.time('assist')
    if (isLost()) {
      return console.log('Lost')
    }

    for (let lineIndex = 0; lineIndex < map.length; lineIndex++) {
      for (let columnIndex = 0; columnIndex < map[0].length; columnIndex++) {
        if (isClosed([lineIndex, columnIndex]) || isDone([lineIndex, columnIndex])) continue

        const neighbours = getNeighbours(lineIndex, columnIndex)
        const closedNeighbours = getClosed(neighbours)

        if (closedNeighbours.length === 0) continue

        const value = Number(map[lineIndex][columnIndex])

        if (closedNeighbours.length === value) {
          const bombs = closedNeighbours.filter(cell => !isBomb(cell))
          if (bombs.length) {
            batchMarkAsBomb(bombs)
          }
        } else if (closedNeighbours.filter(cell => isBomb(cell)).length === Number(value)) {
          const safeCells = closedNeighbours.filter(cell => !isBomb(cell))
          if (safeCells.length) {
            batchOpen(safeCells)
          }
        }
      }
    }
    console.timeEnd('assist')
  }

  function isDone([i, j]) {
    const neighbours = getNeighbours(i, j)
    const unknownNeighbours = getClosed(neighbours).filter(cell => !isBomb(cell))
    return unknownNeighbours.length === 0
  }

  function isLost () {
    return map.some(line => line.includes('*'))
  }

  const onClick = (function  (e, lineIndex, columnIndex) {
    if (e.metaKey) {
      setBomb([lineIndex, columnIndex])
      return
    }
    openCell([lineIndex, columnIndex], true)
  })

  if (!show) {
    return <button onClick={() => setShow(!show)}>Show</button>
  }

  return (
    <>
    <button onClick={() => setShow(!show)}>Show</button>
    {map.map((line, lineIndex) =>
      <div className="Row" key={lineIndex}>
        {line.map((point, columnIndex) =>
          <Cell
            key={[lineIndex, columnIndex]}
            lineIndex={lineIndex}
            columnIndex={columnIndex}
            isBomb={bombCoords[[lineIndex, columnIndex]]}
            isOpened={isOpened([lineIndex, columnIndex])}
            isClosed={isClosed([lineIndex, columnIndex])}
            isDone={isDone([lineIndex, columnIndex])}
            point={point}
            onClick={onClick}
          />
        )}
      </div>
    )}
    </>
  )
}

const Cell = memo(function ({
  lineIndex,
  columnIndex,
  isBomb,
  isOpened,
  isClosed,
  isDone,
  point,
  onClick,
}) {
  const isLoading = isOpened && isClosed
  return (
    <div
      key={columnIndex}
      className={`Cell ${isBomb ? 'Bomb' : '' } ${isOpened && !isClosed ? 'Opened' : ''} ${isDone ? 'Done' : ''} ${isLoading ? 'Loading' : ''}`}
      onClick={(e) => onClick(e, lineIndex, columnIndex)}
    >{(isOpened || !isClosed) && !isLoading ? point : ''}</div>
  )
})

export default App;
