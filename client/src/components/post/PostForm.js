import React from 'react';

const PostForm = ({ token, logout, homepage }) => {
    const model = {
        s: 'XBTUSD',
        c: 'B',
        t: 'M',
        tag: '1M',
        tp: '0%',
        p: '1%',
        q: '0.01XBT',
        a: 'Test123',
        code: ''
    }

    const onChange = (e) => {
        console.log(e.target)
    }

    // const createRow = () => {
    //     return (
    //         <tr>
    //             <td>{(new Date()).toUTCString()}</td>
    //             <td>{model.s}</td>
    //             <td>{model.c}</td>
    //             <td>{model.t}</td>
    //             <td>{model.tag}</td>
    //             <td>{model.tp}</td>
    //             <td>{model.p}</td>
    //             <td>{model.q}</td>
    //             <td>{model.a}</td>
    //         </tr>
    //     )
    // }

    const onSubmit = (e) => {
        e.preventDefault();
        console.log(e.target.value)

        // fetch('/ccxt', {
        //     method: 'POST',
        //     headers: {
        //         'Accept': 'application/json',
        //         'Content-Type': 'application/json',
        //         'Authentication': token
        //     },
        //     body: JSON.stringify(data)
        // }).then(() => {

        // });
    }
    
    //Validation
    // const sValues = ['XBTUSD','XRPUSD','ETHUSD']
    // const cValues = ['B','S','CL','CS']
    // const tValues = ['M','L']
    // const tagReg = /^[0-9]{1,}M$/
    // const tpReg = /^[0-9]{1,}%$|^[0-9]{1,5}\.[0-9]{1,3}%$/
    // const pReg = /^[0-9]{1,}%$|^[0-9]{1,5}\.[0-9]{1,3}%$/
    // const qReg = /^[0-9]{1,}XBT$|^[0-9]{1,5}\.[0-9]{1,4}XBT$|^auto$/
    // const aReg = /^[A-Za-z0-9]{3,}$/
    // const codeReg = /^[0-9]{5}$/

    // console.log(sValues.includes(s))
    // console.log(cValues.includes(c))
    // console.log(tValues.includes(t))
    // console.log(tagReg.test(tag))
    // console.log(tpReg.test(tp))
    // console.log(pReg.test(p))
    // console.log(qReg.test(q))
    // console.log(aReg.test(a))
    // console.log(codeReg.test(code))

    // if(!(sValues.includes(s) && cValues.includes(c) && tValues.includes(t) &&
    //     tagReg.test(tag) && tpReg.test(tp) && pReg.test(p) && qReg.test(q) && 
    //     aReg.test(a) && codeReg.test(code))
    // ) {
    //     alert('Check your values before submitting!')
    //     return
    // }

    return (
        <div className='post-container'>
            <div className="title">
                <h1>CCXT Bitmex POST-Form - Send your trades straight to Bitmex from here!</h1>
                <p>Alpha V0.2</p>
            </div>
            <div className="form">
                <form id="form">
                    <div className="form-group">
                        <div>
                            <label htmlFor="s">Symbol ['XBTUSD','XRPUSD','ETHUSD']:</label><br/>
                            <input type="text" placeholder="s" name="s" value={model.s} onChange={onChange} required/>
                        </div>
                        <div>
                            <label htmlFor="c">Order ['S','B','CL' or 'CS']:</label><br/>
                            <input type="text" placeholder="c" name="c" value={model.c} onChange={onChange} required/>
                        </div>
                        <div>
                            <label htmlFor="t">Type ['M' or 'L']:</label><br/>
                            <input type="text" placeholder="t" name="t" value={model.t} onChange={onChange} required/>
                        </div>
                        <div>
                            <label htmlFor="tag">Tag [Timeframe]:</label><br/>
                            <input type="text" placeholder="tag" name="tag" value={model.tag} onChange={onChange} required/>
                        </div>
                    </div>
                    <div className="form-group">
                        <div>
                            <label htmlFor="tp">TP [Target Percentage%]:</label><br/>
                            <input type="text" placeholder="tp" name="tp" value={model.tp} onChange={onChange}/>
                        </div>
                        <div>
                            <label htmlFor="p">Price [Offset Percentage%]:</label><br/>
                            <input type="text" placeholder="p" name="p" value={model.p} onChange={onChange}/>
                        </div>
                        <div>
                            <label htmlFor="q">Quantity ['#amountUSD']:</label><br/>
                            <input type="text" placeholder="q" name="q" value={model.q} onChange={onChange} required/>
                        </div>
                        <div>
                            <label htmlFor="a">Account [Username]:</label><br/>
                            <input type="text" placeholder="a" name="a" value={model.a} onChange={onChange} required/>
                        </div>
                        <div>
                            <label htmlFor="code">Access Code:</label><br/>
                            <input type="text" placeholder="code" name="code" value={model.code} onChange={onChange} required/>
                        </div>
                        <input type="submit" value="Submit" onClick={onSubmit}/>
                        <input type='submit' value='Go to Home' onClick={ homepage }/>
                        <input type='submit' value='Logout' onClick={ logout }/>
                    </div>
                </form>
            </div>
            <br/><br/>
            <div className="table">
                <table style={{width:'100%', textAlign:'left'}} id="log">
                    <thead className="table-head">
                        <th>Date</th>
                        <th>Symbol</th>
                        <th>Side</th>
                        <th>Type</th>
                        <th>Tag</th>
                        <th>TP</th>
                        <th>P</th>
                        <th>Qnty</th>
                        <th>Account</th>
                    </thead>
                    <tbody>
                        {/*INSERT*/}
                        <tr>
                        <td>EXAMPLE</td>
                        <td>{model.s}</td>
                        <td>{model.c}</td>
                        <td>{model.t}</td>
                        <td>{model.tag}</td>
                        <td>{model.tp}</td>
                        <td>{model.p}</td>
                        <td>{model.q}</td>
                        <td>{model.a}</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    )
}

export default PostForm;