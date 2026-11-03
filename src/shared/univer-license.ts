/**
 * Application-owned Univer credentials for localhost, 127.0.0.1 and DSH desktop (app).
 * Issued 2026-11-03T06:48:05Z; expires 2027-02-03T15:00:00Z. Rotate before expiry.
 *
 * `UNIVER_LICENSE` is the contents of license.txt and is all the Web SDK needs.
 * `UNIVER_LICENSE_KEY` is the contents of licenseKey.txt; the Collaboration SDK and Exchange
 * verify the License with it.
 */
export const UNIVER_LICENSE =
  '2115848189581398022-1-eyJpIjoiMjExNTg0ODE4OTU4MTM5ODAyMiIsInYiOiIxIiwicCI6InZjdWtDbnBpL3VpUkdvUUtKUlVxbFN0UFhwVjFGWEYrQ1F1cWhqdHVtNTA9IiwiZG0iOlsibG9jYWxob3N0IiwiYXBwIiwiMTI3LjAuMC4xIl0sInJ0IjozLCJmdCI6eyJ1ZiI6eyJtdSI6MjE0NzQ4MzY0NiwiZXQiOjE4MDE2NjY4MDAsIm1tIjoyMTQ3NDgzNjQ2LCJjdSI6MjE0NzQ4MzY0Nn0sInNmIjp7ImV0IjoxODAxNjY2ODAwLCJydiI6dHJ1ZSwicHRuIjoyMTQ3NDgzNjQ2LCJtaXMiOjIxNDc0ODM2NDYsIm1wbiI6MjE0NzQ4MzY0NiwibmMiOjIxNDc0ODM2NDYsImllYyI6MCwiZmNjIjowfSwiZGYiOnsiZXQiOjE4MDE2NjY4MDAsInJ2Ijp0cnVlLCJtaXMiOjIxNDc0ODM2NDYsIm1wbiI6MjE0NzQ4MzY0NiwiaWVjIjowfSwid3NmIjp7ImV0IjoxODAxNjY2ODAwLCJobiI6MjE0NzQ4MzY0Nn0sImNmIjp7ImV0IjoxODAxNjY2ODAwLCJtbiI6MSwibWMiOjIxNDc0ODM2NDZ9LCJlZiI6eyJldCI6MTgwMTY2NjgwMCwibWVjIjoyMTQ3NDgzNjQ2fX0sInVkIjoxODAxNjY2ODAwLCJhdCI6MTc5MzY4ODQ4NSwiZSI6ImRldmVsb3BlckB1bml2ZXIuYWkiLCJkIjo4LCJuIjoxMzJ9-5Rl81l5ek8CnaXcU3DVDd0WEux+O9BV6+tQFDynYWSj7RZP9Pc/mQOgmuZt4WvWZHrTQa0qA+/EBtmnnLk50DA==-1801666800'

export const UNIVER_LICENSE_KEY =
  'bqczhaDN38sWTufc+FLGU1ufpbxlIUl49viBpijmMqNGJFUvl61QhUNSesqQJimi7/plIPcKrBlA5LUDg8HBCQ=='

export interface UniverServerCredentials {
  readonly license: string
  readonly licenseKey: string
}

type Environment = Readonly<Record<string, string | undefined>>

/** Web SDK License: `UNIVER_LICENSE` from the environment, else the bundled one. */
export function univerLicense(env: Environment): string {
  return env['UNIVER_LICENSE']?.trim() || UNIVER_LICENSE
}

/**
 * Credentials for the Collaboration SDK and Exchange. `UNIVER_LICENSE` and
 * `UNIVER_LICENSE_KEY` replace the bundled pair together; the SDKs never mix sources.
 */
export function univerServerCredentials(env: Environment): UniverServerCredentials {
  const license = env['UNIVER_LICENSE']?.trim()
  if (!license) return { license: UNIVER_LICENSE, licenseKey: UNIVER_LICENSE_KEY }
  const licenseKey = env['UNIVER_LICENSE_KEY']?.trim()
  if (!licenseKey) throw new Error('UNIVER_LICENSE is set without UNIVER_LICENSE_KEY')
  return { license, licenseKey }
}
