import { useEffect, useState, useRef } from 'react'
import reactLogo from './assets/react.svg'
import viteLogo from '/vite.svg'
import './App.css'
import {usePaginatedFetch } from  './Hooks'
//import type {HomePageContentItem} from  './Hooks'
import Test from "./Test.rsx";
//import HighResTimer from './Timer1'
//import HighResTimerRT from './Timer2'


function App() {
  //const init = useRef(false);
  //const c = useRef(0);
  //const inter = useRef(0);
  //const {fetchData, loading, data, hasNext, nextCursor} = usePaginatedFetch();

  const [count, setCount] =  useState(0);


  /*function debounce<T>(fn: (...a: T[])=>(void), delay: number) {
    let timer: any;
    

    return (...args: T[]) => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        fn(...args);
      }, delay);
    };
  }

  const log = (id: number, name: string) => console.log(id, name);
  const d = debounce(log, 200);

  d(1, "Kyle");*/


  


  function throttle<T>(fn: (...a:T[])=>void, delay: number) {
    let nextTime = Date.now() + delay;
    return function (this: ThisParameterType<T>, ...arg: T[]) {
      const currTime = Date.now();
      if(nextTime < currTime) {
        fn.apply(this, arg);
        nextTime = Date.now() + delay;
      }
    }
  }

  /*function downFire() {
    console.log("down")
  }
  function down() {
    inter.current = setInterval(throttle(downFire, 100), 1)
  }
  function up() {
    console.log("up")
    if(inter.current) {
      clearInterval(inter.current)
    }
  }
  useEffect(()=>{
    console.log("App mounted")
    if(!init.current) {
      
      fetchData(nextCursor, 25)
      init.current = true;
    }
    addEventListener("mousedown", down)
    addEventListener("mouseup", up)

    return ()=>{
      removeEventListener('mousedown', down)
      removeEventListener('mouseup', up)
    }

  }, []) */

  function handleClick() {
    setCount((c) => (c + 1));
    /* if(hasNext) {
      fetchData(nextCursor, 25)
    } */
  }

  
  return (
    <>
      <div>
        {/* <Test label="Counter" /> */}
        {/* <HighResTimer></HighResTimer>
        <HighResTimerRT></HighResTimerRT> */}
        {count % 2 === 0 && <Test count={count}></Test>}
        <a href="https://vite.dev" target="_blank">
          <img src={viteLogo} className="logo" alt="Vite logo" />
        </a>
        <a href="https://react.dev" target="_blank">
          <img src={reactLogo} className="logo react" alt="React logo" />
        </a>
        <button onClick={handleClick}>
          App button
        </button>
      </div>
      {/* <h1>Vite + React</h1>
      <div className="card">

        <ul>
        {
            data.map((item, index)=>(<li key={index}>
              {item.name}
            </li>))
        }
        {loading && <div>Loading...</div>}
        
        </ul>
        <button onClick={handleClick}>
          Page
        </button>
        <p>
          Edit <code>src/App.tsx</code> and save to test HMR
        </p>
      </div>
      <p className="read-the-docs">
        Click on the Vite and React logos to learn more
      </p> */}
    </>
  )
}

export default App
