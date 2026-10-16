"use client";

import styles from "./sign-in/sign-in.module.css";

export default function WorkspaceError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <main className={styles.page}><section className={styles.card}><span className={styles.eyebrow}>BLACKFIN</span><h1>Temporarily unavailable.</h1><p>The workspace could not finish this request. If you were saving, check the record before submitting again.</p><button onClick={reset}>Try again</button></section></main>;
}
