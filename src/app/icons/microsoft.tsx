// https://commons.wikimedia.org/wiki/File:Microsoft_-_SuperTinyIcons.svg
// SuperTinyIcons project, Public domain, via Wikimedia Commons
// Converted with https://react-svgr.com/playground/?icon=true&typescript=true
import * as React from "react"
import { SVGProps } from "react"

const SvgComponent = (props: SVGProps<SVGSVGElement>) => (
    <svg
        xmlns="http://www.w3.org/2000/svg"
        aria-label="Microsoft"
        viewBox="0 0 512 512"
        width="1em"
        height="1em"
        { ...props }
    >
        <rect width={ 512 } height={ 512 } fill="#fff" rx="15%"/>
        <path fill="#f25022" d="M75 75v171h171V75z"/>
        <path fill="#7fba00" d="M266 75v171h171V75z"/>
        <path fill="#00a4ef" d="M75 266v171h171V266z"/>
        <path fill="#ffb900" d="M266 266v171h171V266z"/>
    </svg>
)
export default SvgComponent
