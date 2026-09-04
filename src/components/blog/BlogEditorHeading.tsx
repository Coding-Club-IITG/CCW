import styles from "./BlogEditorHeading.module.scss";

interface BlogEditorHeadingProps {
  kicker: string;
  title: string;
  description: string;
}

export default function BlogEditorHeading({
  kicker,
  title,
  description,
}: BlogEditorHeadingProps) {
  return (
    <header className={styles.header}>
      <span className={styles.kicker}>{kicker}</span>
      <h1>{title}</h1>
      <p>{description}</p>
    </header>
  );
}
