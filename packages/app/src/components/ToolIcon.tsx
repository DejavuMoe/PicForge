import { DiAndroid } from 'react-icons/di';
import { FaImage, FaApple } from 'react-icons/fa';
export function ToolIcon({ tool, className = '' }: { tool: string; className?: string }) {
  const Icon = tool === 'android' ? DiAndroid : tool === 'ios' ? FaApple : FaImage;
  return <Icon className={className} aria-hidden="true" />;
}
