import img from './large.jpg'
import img2 from './nasa.jpg'

// import fetch from 'node-fetch'
// import App from './App'
// need to parse req at the top!

export const cache = (req) => {
  return req.url.pathname
}

const render = async (opts) => {
  // const google = await fetch('http://google.com')

  if (opts.url.pathname === '/no') {
    // this kill sthe connectionxxxx
    return null
  }

  return `<html>
    <head>
      <meta charset="UTF-8" />
      ${opts.head}
    </head>
    <body>
      YESH!xxxxxxx
      <img src="${img}" />
      <img src="${img2}" />

      <div id="react" />
      ${opts.body}

    </body>
  </html>`
}

export default render

// setTimeout(() => {}, 1e3)

// import x

// blurf
