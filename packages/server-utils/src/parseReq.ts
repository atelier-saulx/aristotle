import http from 'http'
import { ParsedReq } from './types'
import uaParser from 'vigour-ua'

const langRe = /^.*?([a-z]{2,4});/

function paramsToObject(entries: URLSearchParams): { [key: string]: string } {
  const result = {}
  for (const [key, value] of entries) {
    result[key] = value
  }
  return result
}

export default (req: http.IncomingMessage, isSsl: boolean): ParsedReq => {
  const parsedUrl = new URL(
    req.url,
    (isSsl ? 'https' : 'http') + '://' + req.headers.host
  )

  const lang = req.headers['accept-language']

  let language: string
  if (lang) {
    const m = lang.match(langRe)
    if (m && m[1]) {
      language = m[1]
    } else {
      language = 'en'
    }
  } else {
    language = 'en'
  }

  const parsed = {
    url: {
      href: parsedUrl.href,
      origin: parsedUrl.origin,
      protocol: parsedUrl.protocol,
      username: parsedUrl.username,
      password: parsedUrl.password,
      host: parsedUrl.host,
      hostname: parsedUrl.hostname,
      port: parsedUrl.port,
      pathname: parsedUrl.pathname,
      search: parsedUrl.search,
      hash: parsedUrl.hash,
      searchParams: paramsToObject(parsedUrl.searchParams),
    },
    language,
    ip: req.socket.remoteAddress,
    method: req.method,
    es5browser: false,
    headers: { ...req.headers },
    ua: uaParser(req.headers['user-agent']),
  }

  if (req.method === 'POST') {
    // @ts-ignore
    return new Promise((resolve) => {
      const chunks = []
      let received = 0

      req.on('data', (chunk) => {
        received += chunk.length
        if (received <= 2056) {
          chunks.push(chunk)
        }
      })

      req.on('end', () => {
        // @ts-ignore
        parsed.data = Buffer.concat(chunks)
        resolve(parsed)
      })

      req.on('error', () => {
        resolve(parsed)
      })
    })
  }

  return parsed
}
