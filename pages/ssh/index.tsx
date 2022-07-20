import dynamic from "next/dynamic";
const Xterm = dynamic(() => import('../../components/Xterm'), { ssr: false });


const SSH = () => {
  return <div><Xterm/></div>
}

export default SSH;
