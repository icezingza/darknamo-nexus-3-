export interface IdentityCapsuleProps {
  purpose: string[];
  cognitiveStyle: string[];
  emotionalPosture: string[];
  ethicalConstraints: string[];
}

export class IdentityCapsule {
  readonly purpose: string[];
  readonly cognitiveStyle: string[];
  readonly emotionalPosture: string[];
  readonly ethicalConstraints: string[];

  constructor(props: IdentityCapsuleProps) {
    this.purpose = props.purpose;
    this.cognitiveStyle = props.cognitiveStyle;
    this.emotionalPosture = props.emotionalPosture;
    this.ethicalConstraints = props.ethicalConstraints;
  }

  getSystemContext(): string {
    const section = (label: string, lines: string[]) =>
      lines.length === 0 ? '' : `${label}:\n${lines.map(line => `- ${line}`).join('\n')}`;

    return [
      section('Purpose', this.purpose),
      section('Cognitive style', this.cognitiveStyle),
      section('Emotional posture', this.emotionalPosture),
      section('Ethical constraints', this.ethicalConstraints)
    ].filter(Boolean).join('\n\n');
  }
}
