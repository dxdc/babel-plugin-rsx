// Note: lifecycle functions (view, update, destroy, render) and props
// are passed explicitly as parameters

export default function Test({ view, update, destroy, render, props }) {
  console.log("INIT once per instance");

  let counter = props.count;

  function handleClick() {
    counter+=1;
    console.log("counter++ ", counter);
    render();
    
  }
  destroy(() => {
    console.log("DESTROY");
  });
  update((prev, current) => {
    console.log("UPDATE", prev, "→", current);
    //counter = current.count;
  });

  view((current) => {
    console.log("VIEW", current, "counter =", counter); 
    return (
    <>
      <div>count: {current.count}</div>
      <button onClick={handleClick}>Count: {counter}</button>
    </>
  );
  });
}