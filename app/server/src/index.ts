import express from "express"

//create express application
const app = express();

// define a port where backend listens for HTTP requests. 

const PORT =  3000;

// Middleware that allows Express to understand JSON request bodies. 
// we will need need it when clients send data to the server.

app.use(express.json());

// health-check endpoint. 
// GET/health lets us verify that the server is running.

app.get("/health", (_request, response)=>(  //_ means it's not being used, intentionally 
    response.json({
        status: "ok",
    })
));

// start the http server and begin listening for requests. 
app.listen(PORT,()=>{
    console.log(`Code Together server running on http://localhost:${PORT}`)
});