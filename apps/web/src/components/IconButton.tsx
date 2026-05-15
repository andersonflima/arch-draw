import type { ButtonHTMLAttributes, ReactNode } from "react";

type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & Readonly<{
  label: string;
  icon: ReactNode;
}>;

export const IconButton = ({ label, icon, ...props }: IconButtonProps) => (
  <button className="icon-button" type="button" aria-label={label} title={label} {...props}>
    {icon}
  </button>
);

