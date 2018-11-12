const fs = require('fs')
const path = require('path')
const { isPkg } = require('./match')

const getDir = (path, index, cb) => {
  if (!index) {
    cb(new Error('cannot find package.json'))
  } else {
    const file = path.slice(0, index).join('/')
    fs.stat(file, (err, stat) => {
      if (err) {
        cb(err)
      } else if (!stat.isDirectory()) {
        getDir(path, index--, cb)
      } else {
        fs.readdir(file, (err, list) => {
          if (err) {
            cb(err)
          } else {
            if (list.includes('package.json')) {
              cb(null, file)
            } else {
              getDir(path, --index, cb)
            }
          }
        })
      }
    })
  }
}

const findPkg = p =>
  new Promise((resolve, reject) => {
    if (isPkg(p)) {
      resolve(path.dirname(p))
    } else {
      const arr = p.split(path.sep)
      getDir(arr, arr.length - 1, (err, val) => {
        if (err) {
          reject(err)
        } else {
          resolve(val)
        }
      })
    }
  })

exports.findPkg = findPkg