if (process.env.NODE_ENV!=='production') {
    require('dotenv').config()
}

const express=require('express');
const path=require('path');
const session=require('express-session');
const ExpressError=require('./utils/ExpressError');
const mongoose=require('mongoose');
const methodOverride=require('method-override');
const bodyParser=require('body-parser');
const server=process.env.SERVER
const passport=require('passport')
const LocalStrategy=require('passport-local')
const User=require('./models/user')
const flash=require('connect-flash')
const { isLoggedIn, handleCORS }=require('./utils/customMiddleware')
const mongoSanitize=require('express-mongo-sanitize')
const helmet=require('helmet')
const dbUrl=process.env.DB_URL
const MongoStore=require("connect-mongo")
const GridStream=require('gridfs-stream')

// Connect to the database and handle connection errors
mongoose.connect(dbUrl, {
    useNewUrlParser: true,
    useCreateIndex: true,
    useUnifiedTopology: true
});
global.db=mongoose.connection;
global.db.on('error', console.error.bind(console, 'connection error:'));
global.db.once('open', () => {
    console.log('Main process connected to database')
    // Initialize gridstrem on global variable so we can read and write files from mongodb gridfs
    global.gfs=GridStream(db.db, mongoose.mongo)
});

// Starting express
const app=express();

// Set up + Middleware
app.set('view engine', 'ejs');
app.set('views', [path.join(__dirname, 'views')]);
app.set('server', server)
app.use(express.static(__dirname));
app.use(express.urlencoded({ extended: true }));
app.use(bodyParser.json({ limit: '50mb' }));
app.use(methodOverride('_method'));
app.use(express.static(path.join(__dirname, 'public')));
app.use(mongoSanitize())

// Helmet
const contentSecurityPolicy={
    directives: {
        defaultSrc: ["'self'", "http://www.clapper.ca", "https://www.clapper.ca"],
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        workerSrc: ["'self'"],
        objectSrc: [],
        imgSrc: ["'self'", 'data:'],
        fontSrc: ["'self'"],
    }
}
app.use(helmet.contentSecurityPolicy(contentSecurityPolicy))

// Morgan logger
//const morgan=require('morgan');
//app.use(morgan('dev'));

// Session
const secret=process.env.SECRET
const sessionConfig={
    store: MongoStore.create({ mongoUrl: dbUrl, touchAfter: 3600*24, secret: secret }),
    name: 'filmApp_session',
    secure: true,
    secret: secret,
    resave: false,
    saveUninitialized: true,
    expires: Date.now()+1000*60*60*24
}
app.use(session(sessionConfig));

// Passport
app.use(passport.initialize())
app.use(passport.session())
passport.use(new LocalStrategy(User.authenticate()))
passport.serializeUser(User.serializeUser())
passport.deserializeUser(User.deserializeUser())

// Flash + Locals
app.use(flash())
app.use((req, res, next) => {
    // Flash
    res.locals.success=req.flash('success')
    res.locals.error=req.flash('error')
    res.locals.warning=req.flash('warning')
    res.locals.currentUser=req.user
    next()
})

// Handle CORS
app.use((req, res, next) => { handleCORS(req, res, next) });

// Routers
const loginRoutes=require('./routes/login');
const createAccountRoutes=require('./routes/createAccount');
const showsRoutes=require('./routes/shows');
const profileRoutes=require('./routes/profile');
const showPageRoutes=require('./routes/ShowPage');
const timesheetRoutes=require('./routes/timesheets')

// Begin Routes
app.get('/', (req, res) => { res.redirect('/login') })

// Site routes
app.use('/login', loginRoutes);
app.use('/createAccount', createAccountRoutes);
app.use('/shows', showsRoutes);
app.use('/profile', profileRoutes);
app.use('/shows/:id/:section', showPageRoutes);
app.use(timesheetRoutes)

// global variables for timesheet generation
global.generatedTimesheets=[]

// Logout route
app.get('/logout', isLoggedIn, (req, res) => {
    req.logout()
    req.flash('success', 'Logout successful.')
    if (req.session.returnTo) { delete req.session.returnTo }
    res.redirect('/login')
})

// 404 Route / no other route matched
app.all('*', (req, res, next) => {
    console.log(`\n\nNo route matched for ${req.originalUrl}\n\n`)
    next(new ExpressError('Page Not Found', 404))
})

// Generic error handling route
app.use((err, req, res, next) => {
    const { statusCode=500 }=err;
    console.log(err.stack);
    err.message='Something Went Wrong :('
    err.stack=undefined
    res.status(statusCode).render('error', {
        title: 'Error',
        statusCode: statusCode,
        args: {},
        err
    })
})

// Open connection on environment-defined port
app.listen(process.env.PORT);