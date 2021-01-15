import { File } from '@saulx/aristotle-build'

export default (file: File): boolean => {
  return  file.mime.split('/')[0] !== 'application' &&
    file.mime !== 'text/css'§
}
