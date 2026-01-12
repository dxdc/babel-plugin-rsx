import { render } from "react-raw";


export default function Test(props) {
  console.log("INIT once per instance");

  // this is stable ref state in RSX model
  let counter = 0;
  counter++;

  console.log("counter =", counter, "props =", props);

  return null;
}