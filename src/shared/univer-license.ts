/**
 * Application-owned Univer credentials for localhost and DSH desktop (app).
 * Issued 2026-11-02T12:19:19Z; expires 2027-02-02T15:00:00Z. Rotate before expiry.
 *
 * `UNIVER_LICENSE` is the contents of license.txt and is all the Web SDK needs.
 * `UNIVER_LICENSE_KEY` is the contents of licenseKey.txt; the Collaboration SDK and Exchange
 * verify the License with it.
 */
export const UNIVER_LICENSE =
  '2115848192541282308-1-eyJpIjoiMjExNTg0ODE5MjU0MTI4MjMwOCIsInYiOiIxIiwicCI6IjN2ZFB2Wkx3R1R1YW5NYmF3MnFLUnRDWXVUaG10R21RQ1pWdllVMHN2dDQ9IiwiZG0iOlsibG9jYWxob3N0IiwiYXBwIl0sInJ0IjozLCJmdCI6eyJ1ZiI6eyJtdSI6MjE0NzQ4MzY0NiwiZXQiOjE4MDE1ODA0MDAsIm1tIjoyMTQ3NDgzNjQ2LCJjdSI6MjE0NzQ4MzY0Nn0sInNmIjp7ImV0IjoxODAxNTgwNDAwLCJydiI6dHJ1ZSwicHRuIjoyMTQ3NDgzNjQ2LCJtaXMiOjIxNDc0ODM2NDYsIm1wbiI6MjE0NzQ4MzY0NiwibmMiOjIxNDc0ODM2NDYsImllYyI6MCwiZmNjIjowfSwiZGYiOnsiZXQiOjE4MDE1ODA0MDAsInJ2Ijp0cnVlLCJtaXMiOjIxNDc0ODM2NDYsIm1wbiI6MjE0NzQ4MzY0NiwiaWVjIjowfSwid3NmIjp7ImV0IjoxODAxNTgwNDAwLCJobiI6MjE0NzQ4MzY0Nn0sImNmIjp7ImV0IjoxODAxNTgwNDAwLCJtbiI6MSwibWMiOjIxNDc0ODM2NDZ9LCJlZiI6eyJldCI6MTgwMTU4MDQwMCwibWVjIjoyMTQ3NDgzNjQ2fX0sInVkIjoxODAxNTgwNDAwLCJhdCI6MTc5MzYyMTk1OSwiZSI6ImRldmVsb3BlckB1bml2ZXIuYWkiLCJkIjo4LCJuIjoxMTR9-LTA6GSD4ovJOOrW0x0LXFtit4Nxzlw2Ulxeif5kPpTYJkmruiKd8HUwDWc9KqjNeKj3EQqy2Uvhm10biBWxODg==-1801580400'

export const UNIVER_LICENSE_KEY =
  '85SiTbHXbJllv7NUhuTMgnL/2jglgt1W746FxedioG4zcV/o6ouagaNHPIq/qVA2Lgipsry/Uaqswa6HUqm6Bw=='

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
