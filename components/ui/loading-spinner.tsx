
import { cn } from "@/lib/utils";

export interface LoadingSpinnerProps extends React.SVGProps<SVGSVGElement> {
    className?: string;
    size?: number;
}

export const LoadingSpinner = ({ className, size = 24, ...props }: LoadingSpinnerProps) => {
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 24 24"
            fill="currentColor"
            xmlns="http://www.w3.org/2000/svg"
            className={cn("text-current", className)}
            {...props}
        >
            <style>
                {`
          .spinner_bar { animation: spinner_spin 1.2s linear infinite; }
          @keyframes spinner_spin {
            0% { opacity: 1; }
            100% { opacity: 0.15; }
          }
        `}
            </style>
            <g>
                <rect x="11" y="1" width="2" height="5" rx="1" className="spinner_bar" style={{ animationDelay: "-1.1s" }} />
                <rect x="11" y="1" width="2" height="5" rx="1" className="spinner_bar" transform="rotate(30 12 12)" style={{ animationDelay: "-1s" }} />
                <rect x="11" y="1" width="2" height="5" rx="1" className="spinner_bar" transform="rotate(60 12 12)" style={{ animationDelay: "-0.9s" }} />
                <rect x="11" y="1" width="2" height="5" rx="1" className="spinner_bar" transform="rotate(90 12 12)" style={{ animationDelay: "-0.8s" }} />
                <rect x="11" y="1" width="2" height="5" rx="1" className="spinner_bar" transform="rotate(120 12 12)" style={{ animationDelay: "-0.7s" }} />
                <rect x="11" y="1" width="2" height="5" rx="1" className="spinner_bar" transform="rotate(150 12 12)" style={{ animationDelay: "-0.6s" }} />
                <rect x="11" y="1" width="2" height="5" rx="1" className="spinner_bar" transform="rotate(180 12 12)" style={{ animationDelay: "-0.5s" }} />
                <rect x="11" y="1" width="2" height="5" rx="1" className="spinner_bar" transform="rotate(210 12 12)" style={{ animationDelay: "-0.4s" }} />
                <rect x="11" y="1" width="2" height="5" rx="1" className="spinner_bar" transform="rotate(240 12 12)" style={{ animationDelay: "-0.3s" }} />
                <rect x="11" y="1" width="2" height="5" rx="1" className="spinner_bar" transform="rotate(270 12 12)" style={{ animationDelay: "-0.2s" }} />
                <rect x="11" y="1" width="2" height="5" rx="1" className="spinner_bar" transform="rotate(300 12 12)" style={{ animationDelay: "-0.1s" }} />
                <rect x="11" y="1" width="2" height="5" rx="1" className="spinner_bar" transform="rotate(330 12 12)" style={{ animationDelay: "0s" }} />
            </g>
        </svg>
    );
};
