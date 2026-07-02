import type { Cohort } from '../testing/ABTestManager';

export interface IIdentityBlueprint {
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

  constructor(props: IIdentityBlueprint) {
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

  getDistilledContext(currentEmotion = '', cohort: Cohort = 'control'): string {
    const compact = (lines: string[]) => lines.join('; ');

    // 'variant' cohort trims cognitiveStyle/emotionalPosture to test whether a
    // shorter per-turn reminder saves tokens without hurting tone; purpose and
    // ethicalConstraints are never dropped, even in the cheaper variant.
    const fields = cohort === 'variant'
      ? [compact(this.purpose), compact(this.ethicalConstraints)]
      : [compact(this.purpose), compact(this.cognitiveStyle), compact(this.emotionalPosture), compact(this.ethicalConstraints)];

    const identityLine = fields.filter(Boolean).join(' | ');
    return currentEmotion ? `${identityLine}\n${currentEmotion}` : identityLine;
  }
}
