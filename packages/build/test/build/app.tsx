import redis from 'redis'
import React from 'react'
import './style.css'

console.log(process.env.SMURK)

const Three = ({ style }) => {
  const a = String(Math.random())
  return (
    <div
      className={a}
      style={{
        backgroundColor: 'blue',
        ...style,
        backgroundColor: 'blue'
      }}
    />
  )
}

const Two = ({ style }) => {
  return <Three style={style} />
}

const x = v => v

const One = () => {
  return (
    <Two
      style={{
        border: '1px solid red',
        fontSize: Math.random() * 10,
        backgroundColor: x({
          alpha: 1
        })
      }}
    />
  )
}

console.log(One, process.env.FOO, redis)
