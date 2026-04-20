export interface ExternalURLs {
  spotify: string
}

export interface Followers {
  href: string | null
  total: number
}

export interface Image {
  url: string
  height: number
  width: number
}

export interface Profile {
  name: string
}

export interface ImageSource {
  height: number | null
  url: string
  width: number | null
}

export interface RequestResponse {
  status: number
  data: string
}
